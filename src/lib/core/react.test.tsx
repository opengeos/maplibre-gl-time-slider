import { describe, it, expect, vi } from 'vitest';
import { render, act, renderHook } from '@testing-library/react';
import { TimeSliderControlReact } from './TimeSliderControlReact';
import { useTimeSlider } from '../hooks/useTimeSlider';
import { createStubMap } from '../../../tests/stubMap';

const BASE = {
  startDate: '2024-04-18T00:00:00Z',
  endDate: '2024-04-22T00:00:00Z',
  granularity: 'day' as const,
};

describe('TimeSliderControlReact', () => {
  it('adds the control on mount and removes it on unmount', () => {
    const { map, container } = createStubMap();
    const { unmount } = render(<TimeSliderControlReact map={map} {...BASE} />);

    expect(map.addControl).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.maplibregl-time-slider-dock')).not.toBeNull();

    unmount();
    expect(map.removeControl).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.maplibregl-time-slider-dock')).toBeNull();
  });

  it('forwards onChange and onStateChange', () => {
    const { map, container } = createStubMap();
    const onChange = vi.fn();
    const onStateChange = vi.fn();
    render(
      <TimeSliderControlReact
        map={map}
        {...BASE}
        onChange={onChange}
        onStateChange={onStateChange}
      />
    );

    const next = container.querySelector('.ts-next') as HTMLButtonElement;
    act(() => next.click());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalled();
  });
});

describe('useTimeSlider', () => {
  it('exposes reactive state and actions', () => {
    const { map } = createStubMap();
    const { result } = renderHook(() => useTimeSlider(map, BASE));

    expect(result.current.control).not.toBeNull();
    expect(result.current.state?.granularity).toBe('day');

    act(() => result.current.next());
    expect(result.current.state?.currentDate.toISOString()).toBe('2024-04-19T00:00:00.000Z');

    act(() => result.current.setGranularity('month'));
    expect(result.current.state?.granularity).toBe('month');
  });
});
