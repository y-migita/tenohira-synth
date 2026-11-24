import { Button as SdkButton } from '@ui-sdk/react/button'
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from '@ui-sdk/react/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui-sdk/react/select'
import { Slider, SliderControl, SliderIndicator, SliderThumb, SliderTrack } from '@ui-sdk/react/slider'
import { Switch, SwitchThumb } from '@ui-sdk/react/switch'
import type { ComponentProps, ReactNode } from 'react'

const focus = 'outline-none focus-visible:ring-2 focus-visible:ring-mint/70'

export function Button({
  variant = 'ghost',
  className = '',
  ...props
}: ComponentProps<typeof SdkButton> & { variant?: 'solid' | 'ghost' }) {
  const look =
    variant === 'solid'
      ? 'bg-mint text-ink hover:bg-mint/85 font-semibold'
      : 'bg-white/5 text-white hover:bg-white/10 border border-line'
  return (
    <SdkButton
      {...props}
      className={`inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-sm transition-colors data-disabled:cursor-not-allowed data-disabled:opacity-40 ${look} ${focus} ${className}`}
    />
  )
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  disabled?: boolean
}) {
  return (
    <SegmentedControl
      aria-label={label}
      value={value}
      disabled={disabled}
      onValueChange={(v) => v && onChange(v as T)}
      className="relative flex rounded-lg border border-line bg-black/30 p-0.5 data-disabled:opacity-40"
    >
      <SegmentedControlIndicator className="absolute top-(--segmented-control-indicator-top) left-(--segmented-control-indicator-left) h-(--segmented-control-indicator-height) w-(--segmented-control-indicator-width) rounded-md bg-white/15 transition-[left,width] duration-150" />
      {options.map((o) => (
        <SegmentedControlItem
          key={o.value}
          value={o.value}
          className={`relative z-10 flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-2 text-xs whitespace-nowrap text-dim data-checked:text-white ${focus}`}
        >
          {o.label}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  )
}

export function Picker<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  disabled?: boolean
}) {
  return (
    <Select items={options} value={value} disabled={disabled} onValueChange={(v) => v && onChange(v as T)}>
      <SelectTrigger
        aria-label={label}
        className={`flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-line bg-black/30 px-2.5 text-sm text-white data-disabled:cursor-not-allowed data-disabled:opacity-40 ${focus}`}
      >
        <SelectValue />
        <span aria-hidden="true" className="text-[10px] text-dim">
          ▼
        </span>
      </SelectTrigger>
      <SelectContent className="z-50 max-h-72 min-w-(--anchor-width) overflow-auto rounded-lg border border-line bg-panel p-1 text-sm text-white shadow-2xl outline-none">
        {options.map((o) => (
          <SelectItem
            key={o.value}
            value={o.value}
            className="cursor-pointer rounded-md px-2.5 py-1.5 outline-none data-highlighted:bg-white/10 data-selected:text-mint"
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-white">
      {label}
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full border border-line bg-black/40 transition-colors data-checked:border-mint data-checked:bg-mint/80 ${focus}`}
      >
        <SwitchThumb className="absolute top-0.5 left-0.5 block size-3.5 rounded-full bg-white transition-transform data-checked:translate-x-4" />
      </Switch>
    </label>
  )
}

export function Range({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  disabled?: boolean
}) {
  return (
    <Slider
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : (v as number))}
      className="w-full data-disabled:opacity-40"
    >
      <SliderControl className="flex h-5 cursor-pointer items-center">
        <SliderTrack className="relative h-1 w-full rounded-full bg-white/15">
          <SliderIndicator className="h-full rounded-full bg-mint" />
          <SliderThumb
            aria-label={label}
            className="top-1/2 block size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow has-focus-visible:ring-2 has-focus-visible:ring-mint"
          />
        </SliderTrack>
      </SliderControl>
    </Slider>
  )
}
