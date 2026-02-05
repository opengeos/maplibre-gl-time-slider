import type { IControl, Map as MapLibreMap } from 'maplibre-gl';
import type {
  TimeSliderOptions,
  TimeSliderState,
  TimeSliderEvent,
  TimeSliderEventHandler,
} from './types';

/**
 * Default options for the TimeSliderControl.
 */
const DEFAULT_OPTIONS: Required<Omit<TimeSliderOptions, 'onChange' | 'onAddLayer' | 'beforeId'>> & { onChange?: TimeSliderOptions['onChange']; onAddLayer?: TimeSliderOptions['onAddLayer']; beforeId?: string } = {
  collapsed: true,
  position: 'top-right',
  title: 'Time Slider',
  panelWidth: 300,
  className: '',
  labels: [],
  initialIndex: 0,
  speed: 1000,
  loop: true,
  onChange: undefined,
  onAddLayer: undefined,
  beforeId: undefined,
};

/**
 * Event handlers map type.
 */
type EventHandlersMap = globalThis.Map<TimeSliderEvent, Set<TimeSliderEventHandler>>;

/**
 * A MapLibre GL control for visualizing time series data with an interactive slider.
 *
 * Supports both vector and raster data by providing a callback function that is
 * invoked when the slider position changes.
 *
 * @example
 * ```typescript
 * const timeSlider = new TimeSliderControl({
 *   title: 'Time Slider',
 *   labels: ['2024-01', '2024-02', '2024-03'],
 *   speed: 1000,
 *   loop: true,
 *   onChange: (index, label) => {
 *     // Update map layers based on current time
 *     console.log(`Current: ${label} (index: ${index})`);
 *   }
 * });
 * map.addControl(timeSlider, 'top-right');
 * ```
 */
export class TimeSliderControl implements IControl {
  private _map?: MapLibreMap;
  private _mapContainer?: HTMLElement;
  private _container?: HTMLElement;
  private _panel?: HTMLElement;
  private _options: Required<Omit<TimeSliderOptions, 'onChange' | 'onAddLayer' | 'beforeId'>> & { onChange?: TimeSliderOptions['onChange']; onAddLayer?: TimeSliderOptions['onAddLayer']; beforeId?: string };
  private _state: TimeSliderState;
  private _eventHandlers: EventHandlersMap = new globalThis.Map();
  private _playbackInterval?: ReturnType<typeof setInterval>;

  // Panel positioning handlers
  private _resizeHandler: (() => void) | null = null;
  private _mapResizeHandler: (() => void) | null = null;
  private _clickOutsideHandler: ((e: MouseEvent) => void) | null = null;

  // DOM element references
  private _labelDisplay?: HTMLElement;
  private _slider?: HTMLInputElement;
  private _playButton?: HTMLButtonElement;
  private _speedInput?: HTMLInputElement;
  private _loopCheckbox?: HTMLInputElement;
  private _addLayerButton?: HTMLButtonElement;

  /**
   * Creates a new TimeSliderControl instance.
   *
   * @param options - Configuration options for the control
   */
  constructor(options: TimeSliderOptions) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
    this._state = {
      collapsed: this._options.collapsed,
      panelWidth: this._options.panelWidth,
      currentIndex: this._options.initialIndex,
      isPlaying: false,
      speed: this._options.speed,
      loop: this._options.loop,
    };
  }

  /**
   * Called when the control is added to the map.
   * Implements the IControl interface.
   *
   * @param map - The MapLibre GL map instance
   * @returns The control's container element
   */
  onAdd(map: MapLibreMap): HTMLElement {
    this._map = map;
    this._mapContainer = map.getContainer();
    this._container = this._createContainer();
    this._panel = this._createPanel();

    // Append panel to map container for independent positioning (avoids overlap with other controls)
    this._mapContainer.appendChild(this._panel);

    // Setup event listeners for panel positioning and click-outside
    this._setupEventListeners();

    // Set initial panel state
    if (!this._state.collapsed) {
      this._panel.classList.add('expanded');
      // Update position after control is added to DOM
      requestAnimationFrame(() => {
        this._updatePanelPosition();
      });
    }

    // Trigger initial onChange if labels exist
    if (this._options.labels.length > 0 && this._options.onChange) {
      this._options.onChange(this._state.currentIndex, this._options.labels[this._state.currentIndex]);
    }

    return this._container;
  }

  /**
   * Called when the control is removed from the map.
   * Implements the IControl interface.
   */
  onRemove(): void {
    this.pause();

    // Remove event listeners
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._mapResizeHandler && this._map) {
      this._map.off('resize', this._mapResizeHandler);
      this._mapResizeHandler = null;
    }
    if (this._clickOutsideHandler) {
      document.removeEventListener('click', this._clickOutsideHandler);
      this._clickOutsideHandler = null;
    }

    // Remove panel from map container
    this._panel?.parentNode?.removeChild(this._panel);

    // Remove button container from control stack
    this._container?.parentNode?.removeChild(this._container);

    this._map = undefined;
    this._mapContainer = undefined;
    this._container = undefined;
    this._panel = undefined;
    this._eventHandlers.clear();
  }

  /**
   * Gets the current state of the control.
   *
   * @returns The current time slider state
   */
  getState(): TimeSliderState {
    return { ...this._state };
  }

  /**
   * Gets the current index.
   *
   * @returns The current index in the labels array
   */
  getCurrentIndex(): number {
    return this._state.currentIndex;
  }

  /**
   * Gets the current label.
   *
   * @returns The current label string
   */
  getCurrentLabel(): string {
    return this._options.labels[this._state.currentIndex] || '';
  }

  /**
   * Gets all labels.
   *
   * @returns Array of all labels
   */
  getLabels(): string[] {
    return [...this._options.labels];
  }

  /**
   * Sets new labels for the slider.
   *
   * @param labels - Array of new labels
   * @param resetIndex - Whether to reset the index to 0
   */
  setLabels(labels: string[], resetIndex = true): void {
    this._options.labels = labels;
    if (resetIndex || this._state.currentIndex >= labels.length) {
      this._state.currentIndex = 0;
    }
    this._updateSliderRange();
    this._updateDisplay();
    this._emit('statechange');
  }

  /**
   * Navigates to a specific index.
   *
   * @param index - The index to navigate to
   */
  goTo(index: number): void {
    const maxIndex = this._options.labels.length - 1;
    const clampedIndex = Math.max(0, Math.min(index, maxIndex));

    if (clampedIndex !== this._state.currentIndex) {
      this._state.currentIndex = clampedIndex;
      this._updateDisplay();
      this._triggerChange();
      this._emit('change');
      this._emit('statechange');
    }
  }

  /**
   * Moves to the next label.
   */
  next(): void {
    const maxIndex = this._options.labels.length - 1;
    if (this._state.currentIndex < maxIndex) {
      this.goTo(this._state.currentIndex + 1);
    } else if (this._state.loop) {
      this.goTo(0);
    }
  }

  /**
   * Moves to the previous label.
   */
  prev(): void {
    if (this._state.currentIndex > 0) {
      this.goTo(this._state.currentIndex - 1);
    } else if (this._state.loop) {
      this.goTo(this._options.labels.length - 1);
    }
  }

  /**
   * Starts playback.
   */
  play(): void {
    if (this._state.isPlaying || this._options.labels.length === 0) return;

    this._state.isPlaying = true;
    this._updatePlayButton();

    this._playbackInterval = setInterval(() => {
      const maxIndex = this._options.labels.length - 1;
      if (this._state.currentIndex < maxIndex) {
        this.goTo(this._state.currentIndex + 1);
      } else if (this._state.loop) {
        this.goTo(0);
      } else {
        this.pause();
      }
    }, this._state.speed);

    this._emit('play');
    this._emit('statechange');
  }

  /**
   * Pauses playback.
   */
  pause(): void {
    if (!this._state.isPlaying) return;

    this._state.isPlaying = false;
    this._updatePlayButton();

    if (this._playbackInterval) {
      clearInterval(this._playbackInterval);
      this._playbackInterval = undefined;
    }

    this._emit('pause');
    this._emit('statechange');
  }

  /**
   * Toggles playback state.
   */
  togglePlayback(): void {
    if (this._state.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Sets the playback speed.
   *
   * @param speed - Speed in milliseconds
   */
  setSpeed(speed: number): void {
    this._state.speed = Math.max(100, speed);
    if (this._speedInput) {
      this._speedInput.value = this._state.speed.toString();
    }

    // Restart playback with new speed if playing
    if (this._state.isPlaying) {
      this.pause();
      this.play();
    }

    this._emit('statechange');
  }

  /**
   * Sets the loop state.
   *
   * @param enabled - Whether to enable looping
   */
  setLoop(enabled: boolean): void {
    this._state.loop = enabled;
    if (this._loopCheckbox) {
      this._loopCheckbox.checked = enabled;
    }
    this._emit('statechange');
  }

  /**
   * Toggles the collapsed state of the control panel.
   */
  toggle(): void {
    this._state.collapsed = !this._state.collapsed;

    if (this._panel) {
      if (this._state.collapsed) {
        this._panel.classList.remove('expanded');
        this._emit('collapse');
      } else {
        this._panel.classList.add('expanded');
        this._updatePanelPosition();
        this._emit('expand');
      }
    }

    this._emit('statechange');
  }

  /**
   * Expands the control panel.
   */
  expand(): void {
    if (this._state.collapsed) {
      this.toggle();
    }
  }

  /**
   * Collapses the control panel.
   */
  collapse(): void {
    if (!this._state.collapsed) {
      this.toggle();
    }
  }

  /**
   * Registers an event handler.
   *
   * @param event - The event type to listen for
   * @param handler - The callback function
   */
  on(event: TimeSliderEvent, handler: TimeSliderEventHandler): void {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set());
    }
    this._eventHandlers.get(event)!.add(handler);
  }

  /**
   * Removes an event handler.
   *
   * @param event - The event type
   * @param handler - The callback function to remove
   */
  off(event: TimeSliderEvent, handler: TimeSliderEventHandler): void {
    this._eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Gets the map instance.
   *
   * @returns The MapLibre GL map instance or undefined if not added to a map
   */
  getMap(): MapLibreMap | undefined {
    return this._map;
  }

  /**
   * Gets the control container element.
   *
   * @returns The container element or undefined if not added to a map
   */
  getContainer(): HTMLElement | undefined {
    return this._container;
  }

  /**
   * Emits an event to all registered handlers.
   *
   * @param event - The event type to emit
   */
  private _emit(event: TimeSliderEvent): void {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      const eventData = { type: event, state: this.getState() };
      handlers.forEach((handler) => handler(eventData));
    }
  }

  /**
   * Triggers the onChange callback.
   */
  private _triggerChange(): void {
    if (this._options.onChange) {
      this._options.onChange(this._state.currentIndex, this._options.labels[this._state.currentIndex]);
    }
  }

  /**
   * Updates the label display and slider position.
   */
  private _updateDisplay(): void {
    if (this._labelDisplay) {
      const label = this._options.labels[this._state.currentIndex] || '';
      const total = this._options.labels.length;
      this._labelDisplay.textContent = `${label} (${this._state.currentIndex + 1}/${total})`;
    }

    if (this._slider) {
      this._slider.value = this._state.currentIndex.toString();
    }
  }

  /**
   * Updates the slider range based on labels.
   */
  private _updateSliderRange(): void {
    if (this._slider) {
      this._slider.max = Math.max(0, this._options.labels.length - 1).toString();
    }
  }

  /**
   * Updates the play button appearance.
   */
  private _updatePlayButton(): void {
    if (this._playButton) {
      this._playButton.innerHTML = this._state.isPlaying
        ? '<span class="time-slider-btn-icon">&#9724;</span> Pause'
        : '<span class="time-slider-btn-icon">&#9654;</span> Play';
    }
  }

  /**
   * Creates the main container element for the control.
   *
   * @returns The container element
   */
  private _createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = `maplibregl-ctrl maplibregl-ctrl-group time-slider-control${
      this._options.className ? ` ${this._options.className}` : ''
    }`;

    // Create toggle button with clock icon
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'time-slider-control-toggle';
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-label', this._options.title);
    toggleBtn.innerHTML = `
      <span class="time-slider-control-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      </span>
    `;
    toggleBtn.addEventListener('click', () => this.toggle());

    container.appendChild(toggleBtn);

    return container;
  }

  /**
   * Creates the panel element with all controls.
   *
   * @returns The panel element
   */
  private _createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'time-slider-control-panel';
    panel.style.width = `${this._options.panelWidth}px`;

    // Create header
    const header = document.createElement('div');
    header.className = 'time-slider-control-header';

    const title = document.createElement('span');
    title.className = 'time-slider-control-title';
    title.textContent = this._options.title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'time-slider-control-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close panel');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.collapse());

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Create content
    const content = document.createElement('div');
    content.className = 'time-slider-control-content';

    // Label display
    this._labelDisplay = document.createElement('div');
    this._labelDisplay.className = 'time-slider-label-display';
    const initialLabel = this._options.labels[this._state.currentIndex] || '';
    const total = this._options.labels.length;
    this._labelDisplay.textContent = total > 0 ? `${initialLabel} (${this._state.currentIndex + 1}/${total})` : 'No data';

    // Slider
    this._slider = document.createElement('input');
    this._slider.type = 'range';
    this._slider.className = 'time-slider-range';
    this._slider.min = '0';
    this._slider.max = Math.max(0, this._options.labels.length - 1).toString();
    this._slider.value = this._state.currentIndex.toString();
    this._slider.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value, 10);
      this.goTo(value);
    });

    // Control buttons
    const controls = document.createElement('div');
    controls.className = 'time-slider-controls';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'time-slider-btn time-slider-prev';
    prevBtn.type = 'button';
    prevBtn.innerHTML = '<span class="time-slider-btn-icon">&#9664;</span> Prev';
    prevBtn.addEventListener('click', () => this.prev());

    this._playButton = document.createElement('button');
    this._playButton.className = 'time-slider-btn time-slider-play';
    this._playButton.type = 'button';
    this._playButton.innerHTML = '<span class="time-slider-btn-icon">&#9654;</span> Play';
    this._playButton.addEventListener('click', () => this.togglePlayback());

    const nextBtn = document.createElement('button');
    nextBtn.className = 'time-slider-btn time-slider-next';
    nextBtn.type = 'button';
    nextBtn.innerHTML = 'Next <span class="time-slider-btn-icon">&#9654;</span>';
    nextBtn.addEventListener('click', () => this.next());

    controls.appendChild(prevBtn);
    controls.appendChild(this._playButton);
    controls.appendChild(nextBtn);

    // Settings row
    const settings = document.createElement('div');
    settings.className = 'time-slider-settings';

    // Speed control
    const speedLabel = document.createElement('label');
    speedLabel.className = 'time-slider-setting';
    speedLabel.innerHTML = 'Speed: ';

    this._speedInput = document.createElement('input');
    this._speedInput.type = 'number';
    this._speedInput.className = 'time-slider-speed-input';
    this._speedInput.value = this._state.speed.toString();
    this._speedInput.min = '100';
    this._speedInput.step = '100';
    this._speedInput.addEventListener('change', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value, 10);
      this.setSpeed(value);
    });

    const msLabel = document.createElement('span');
    msLabel.textContent = ' ms';

    speedLabel.appendChild(this._speedInput);
    speedLabel.appendChild(msLabel);

    // Loop checkbox
    const loopLabel = document.createElement('label');
    loopLabel.className = 'time-slider-setting time-slider-loop-label';

    this._loopCheckbox = document.createElement('input');
    this._loopCheckbox.type = 'checkbox';
    this._loopCheckbox.className = 'time-slider-loop-checkbox';
    this._loopCheckbox.checked = this._state.loop;
    this._loopCheckbox.addEventListener('change', (e) => {
      this.setLoop((e.target as HTMLInputElement).checked);
    });

    const loopText = document.createElement('span');
    loopText.textContent = ' Loop';

    loopLabel.appendChild(this._loopCheckbox);
    loopLabel.appendChild(loopText);

    settings.appendChild(speedLabel);
    settings.appendChild(loopLabel);

    // Assemble content
    content.appendChild(this._labelDisplay);
    content.appendChild(this._slider);
    content.appendChild(controls);
    content.appendChild(settings);

    // Add Layer button at the bottom (if callback provided)
    if (this._options.onAddLayer) {
      this._addLayerButton = document.createElement('button');
      this._addLayerButton.className = 'time-slider-btn time-slider-add-layer';
      this._addLayerButton.type = 'button';
      this._addLayerButton.innerHTML = '<span class="time-slider-btn-icon">&#43;</span> Add Layer';
      this._addLayerButton.title = 'Add current time period as a persistent layer';
      this._addLayerButton.addEventListener('click', () => {
        if (this._options.onAddLayer) {
          this._options.onAddLayer(
            this._state.currentIndex,
            this._options.labels[this._state.currentIndex],
            this._options.beforeId
          );
        }
      });
      content.appendChild(this._addLayerButton);
    }

    panel.appendChild(header);
    panel.appendChild(content);

    return panel;
  }

  /**
   * Setup event listeners for panel positioning and click-outside behavior.
   */
  private _setupEventListeners(): void {
    // Click outside to close (check both container and panel since they're now separate)
    this._clickOutsideHandler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        this._container &&
        this._panel &&
        !this._container.contains(target) &&
        !this._panel.contains(target)
      ) {
        this.collapse();
      }
    };
    document.addEventListener('click', this._clickOutsideHandler);

    // Update panel position on window resize
    this._resizeHandler = () => {
      if (!this._state.collapsed) {
        this._updatePanelPosition();
      }
    };
    window.addEventListener('resize', this._resizeHandler);

    // Update panel position on map resize (e.g., sidebar toggle)
    this._mapResizeHandler = () => {
      if (!this._state.collapsed) {
        this._updatePanelPosition();
      }
    };
    this._map?.on('resize', this._mapResizeHandler);
  }

  /**
   * Detect which corner the control is positioned in.
   *
   * @returns The position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
   */
  private _getControlPosition(): 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' {
    const parent = this._container?.parentElement;
    if (!parent) return 'top-right'; // Default

    if (parent.classList.contains('maplibregl-ctrl-top-left')) return 'top-left';
    if (parent.classList.contains('maplibregl-ctrl-top-right')) return 'top-right';
    if (parent.classList.contains('maplibregl-ctrl-bottom-left')) return 'bottom-left';
    if (parent.classList.contains('maplibregl-ctrl-bottom-right')) return 'bottom-right';

    return 'top-right'; // Default
  }

  /**
   * Update the panel position based on button location and control corner.
   * Positions the panel next to the button, expanding in the appropriate direction.
   */
  private _updatePanelPosition(): void {
    if (!this._container || !this._panel || !this._mapContainer) return;

    // Get the toggle button (first child of container)
    const button = this._container.querySelector('.time-slider-control-toggle');
    if (!button) return;

    const buttonRect = button.getBoundingClientRect();
    const mapRect = this._mapContainer.getBoundingClientRect();
    const position = this._getControlPosition();

    // Calculate button position relative to map container
    const buttonTop = buttonRect.top - mapRect.top;
    const buttonBottom = mapRect.bottom - buttonRect.bottom;
    const buttonLeft = buttonRect.left - mapRect.left;
    const buttonRight = mapRect.right - buttonRect.right;

    const panelGap = 5; // Gap between button and panel

    // Reset all positioning
    this._panel.style.top = '';
    this._panel.style.bottom = '';
    this._panel.style.left = '';
    this._panel.style.right = '';

    switch (position) {
      case 'top-left':
        // Panel expands down and to the right
        this._panel.style.top = `${buttonTop + buttonRect.height + panelGap}px`;
        this._panel.style.left = `${buttonLeft}px`;
        break;

      case 'top-right':
        // Panel expands down and to the left
        this._panel.style.top = `${buttonTop + buttonRect.height + panelGap}px`;
        this._panel.style.right = `${buttonRight}px`;
        break;

      case 'bottom-left':
        // Panel expands up and to the right
        this._panel.style.bottom = `${buttonBottom + buttonRect.height + panelGap}px`;
        this._panel.style.left = `${buttonLeft}px`;
        break;

      case 'bottom-right':
        // Panel expands up and to the left
        this._panel.style.bottom = `${buttonBottom + buttonRect.height + panelGap}px`;
        this._panel.style.right = `${buttonRight}px`;
        break;
    }
  }
}
