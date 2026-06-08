import type { DockController } from './types';

/**
 * Imperative handle for the playback cluster.
 */
export interface PlaybackHandle {
  root: HTMLElement;
  /** Update the play/pause button icon and state. */
  syncPlayState(): void;
  /** Sync the speed input and loop toggle from state. */
  syncInputs(): void;
}

/**
 * Creates a labeled icon button.
 */
function iconButton(label: string, glyph: string, className: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `time-slider-btn ${className}`;
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.innerHTML = glyph;
  return btn;
}

/**
 * Builds the left cluster: the transport controls (previous, play/pause, next,
 * loop) plus the speed input. The current date is shown on the axis marker.
 *
 * @param controller - The control's UI-facing API
 * @returns A playback handle for syncing display/state
 */
export function createPlayback(controller: DockController): PlaybackHandle {
  const root = document.createElement('div');
  root.className = 'ts-left';

  const controls = document.createElement('div');
  controls.className = 'ts-playback';

  const prevBtn = iconButton('Previous', '&#9198;', 'ts-prev');
  const playBtn = iconButton('Play', '&#9654;', 'ts-play');
  const nextBtn = iconButton('Next', '&#9197;', 'ts-next');
  const loopBtn = iconButton('Toggle loop', '&#8635;', 'ts-loop');

  prevBtn.addEventListener('click', () => controller.prev());
  playBtn.addEventListener('click', () => controller.togglePlayback());
  nextBtn.addEventListener('click', () => controller.next());
  loopBtn.addEventListener('click', () => controller.setLoop(!controller.getState().loop));

  controls.append(prevBtn, playBtn, nextBtn, loopBtn);

  const speed = document.createElement('label');
  speed.className = 'ts-speed';
  const speedInput = document.createElement('input');
  speedInput.type = 'number';
  speedInput.className = 'ts-speed-input';
  speedInput.min = '100';
  speedInput.step = '100';
  speedInput.title = 'Playback speed (ms per step)';
  speedInput.addEventListener('change', () => {
    const value = parseInt(speedInput.value, 10);
    if (!Number.isNaN(value)) controller.setSpeed(value);
  });
  const ms = document.createElement('span');
  ms.className = 'ts-speed-unit';
  ms.textContent = 'ms';
  speed.append(speedInput, ms);

  root.append(controls, speed);

  const syncPlayState = (): void => {
    const { isPlaying } = controller.getState();
    playBtn.innerHTML = isPlaying ? '&#9208;' : '&#9654;';
    playBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
    playBtn.title = isPlaying ? 'Pause' : 'Play';
    playBtn.classList.toggle('ts-active', isPlaying);
  };

  const syncInputs = (): void => {
    const { speed: spd, loop } = controller.getState();
    speedInput.value = String(spd);
    loopBtn.classList.toggle('ts-active', loop);
  };

  syncPlayState();
  syncInputs();

  return { root, syncPlayState, syncInputs };
}
