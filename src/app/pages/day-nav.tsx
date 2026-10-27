import { DatePicker, parseDate } from "@ark-ui/solid/date-picker"
import type { DateValue } from "@ark-ui/solid/date-picker"
import { ChevronLeft, ChevronRight } from "lucide-solid"
import { For, createEffect, createMemo, createSignal } from "solid-js"
import { Portal } from "solid-js/web"
import { localDayStart, type DayGroup } from "~/domain"
import { t } from "~/i18n"
import { locale } from "~/i18n/locale"
import { buttonVariants, cn } from "~/ui"

const iconProps = { class: "size-4", strokeWidth: 1.75 }

const CALENDAR_GAP = 8
const CALENDAR_SCREEN_PADDING = 12

const uiZoom = (): number => {
    const zoom = Number(getComputedStyle(document.documentElement).zoom)
    return zoom > 0 ? zoom : 1
}

const visualBox = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    const zoom = uiZoom()
    const scale =
        element.offsetHeight > 0 ? rect.height / element.offsetHeight : 1
    if (scale > 1.01) return rect
    return new DOMRect(
        rect.x * zoom,
        rect.y * zoom,
        rect.width * zoom,
        rect.height * zoom
    )
}

const placeCalendar = (floating: HTMLElement | null): void => {
    const anchor =
        document.querySelector<HTMLElement>(
            "[data-scope='date-picker'][data-part='trigger'][data-state='open']"
        ) ??
        document.querySelector<HTMLElement>(
            "[data-scope='date-picker'][data-part='trigger']"
        )
    if (!floating || !anchor) return
    const zoom = uiZoom()
    const anchorBox = visualBox(anchor)
    const fullHeight = floating.scrollHeight * zoom
    const width = floating.offsetWidth * zoom
    const spaceBelow =
        window.innerHeight - anchorBox.bottom - CALENDAR_SCREEN_PADDING
    const spaceAbove = anchorBox.top - CALENDAR_SCREEN_PADDING
    const openAbove = spaceBelow < fullHeight && spaceAbove > spaceBelow
    const room = Math.max(
        0,
        (openAbove ? spaceAbove : spaceBelow) - CALENDAR_GAP
    )
    const used = Math.min(fullHeight, room)
    const visualTop = openAbove
        ? anchorBox.top - CALENDAR_GAP - used
        : anchorBox.bottom + CALENDAR_GAP
    let visualLeft = anchorBox.left
    if (visualLeft + width > window.innerWidth - CALENDAR_SCREEN_PADDING) {
        visualLeft = Math.max(
            CALENDAR_SCREEN_PADDING,
            window.innerWidth - CALENDAR_SCREEN_PADDING - width
        )
    }
    floating.style.position = "fixed"
    floating.style.top = `${visualTop / zoom}px`
    floating.style.left = `${visualLeft / zoom}px`
    floating.style.right = "auto"
    floating.style.bottom = "auto"
    floating.style.transform = "none"
    floating.style.zIndex = "80"
    floating.style.maxHeight = `${room / zoom}px`
}

const dayCellClass = [
    "flex size-9 cursor-pointer items-center justify-center rounded",
    "font-mono text-sm text-ink outline-none",
    "hover:bg-inset",
    "data-today:font-semibold",
    "data-selected:bg-accent data-selected:text-on-accent data-selected:hover:bg-accent",
    "data-unavailable:pointer-events-none data-unavailable:text-muted data-unavailable:hover:bg-transparent",
    "data-disabled:pointer-events-none data-disabled:text-muted",
].join(" ")

export const DayNav = (props: {
    days: DayGroup[]
    value: number
    onChange: (start: number) => void
    compact?: boolean
}) => {
    const available = createMemo(
        () => new Set(props.days.map(day => dayKey(day.start)))
    )
    const index = () => props.days.findIndex(day => day.start === props.value)
    const [focused, setFocused] = createSignal(dateValue(props.value))

    createEffect(() => {
        setFocused(dateValue(props.value))
    })

    const step = (offset: number) => {
        const next = props.days[index() + offset]
        if (next) props.onChange(next.start)
    }

    return (
        <div class="flex items-center gap-1">
            <button
                type="button"
                class={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
                aria-label={t("app.previousDay")}
                disabled={index() <= 0}
                onClick={() => step(-1)}
            >
                <ChevronLeft {...iconProps} />
            </button>
            <DatePicker.Root
                locale={locale()}
                selectionMode="single"
                closeOnSelect
                positioning={{
                    placement: "bottom-start",
                    gutter: 8,
                    flip: true,
                    slide: true,
                    overflowPadding: CALENDAR_SCREEN_PADDING,
                    updatePosition: async ({
                        updatePosition,
                        floatingElement,
                    }) => {
                        await updatePosition()
                        placeCalendar(floatingElement)
                    },
                }}
                value={[dateValue(props.value)]}
                focusedValue={focused()}
                onFocusChange={details => {
                    const next = details.focusedValue
                    const current = focused()
                    if (
                        current.year === next.year &&
                        current.month === next.month &&
                        current.day === next.day
                    ) {
                        return
                    }
                    setFocused(next)
                }}
                onValueChange={details => {
                    const next = details.value[0]
                    if (next) props.onChange(midnight(next))
                }}
                isDateUnavailable={date => !available().has(dayKeyOf(date))}
                translations={{
                    content: t("app.calendar"),
                    prevTrigger: () => t("app.previousMonth"),
                    nextTrigger: () => t("app.nextMonth"),
                    trigger: () => t("app.openCalendar"),
                }}
            >
                <DatePicker.Control>
                    <DatePicker.Trigger
                        class={cn(
                            "cursor-pointer rounded px-1 font-mono font-semibold tracking-tight text-ink outline-none hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-accent/20",
                            props.compact ? "text-base" : "text-lg"
                        )}
                        aria-label={t("app.openCalendar")}
                    >
                        {dayLabel(props.value)}
                    </DatePicker.Trigger>
                </DatePicker.Control>
                <Portal>
                    <DatePicker.Positioner class="overflow-y-auto overscroll-contain [scrollbar-color:var(--muted)_transparent] [scrollbar-width:thin]">
                        <DatePicker.Content class="z-50 rounded border border-line bg-surface p-3 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.12),0_1px_3px_-1px_rgba(15,23,42,0.08)]">
                            <DatePicker.View view="day">
                                <DatePicker.Context>
                                    {api => (
                                        <>
                                            <DatePicker.ViewControl class="mb-2 flex items-center justify-between gap-2">
                                                <DatePicker.PrevTrigger
                                                    class={buttonVariants({
                                                        variant: "ghost",
                                                        size: "icon",
                                                    })}
                                                >
                                                    <ChevronLeft
                                                        {...iconProps}
                                                    />
                                                </DatePicker.PrevTrigger>
                                                <DatePicker.RangeText class="font-mono text-base font-medium text-ink" />
                                                <DatePicker.NextTrigger
                                                    class={buttonVariants({
                                                        variant: "ghost",
                                                        size: "icon",
                                                    })}
                                                >
                                                    <ChevronRight
                                                        {...iconProps}
                                                    />
                                                </DatePicker.NextTrigger>
                                            </DatePicker.ViewControl>
                                            <DatePicker.Table>
                                                <DatePicker.TableHead>
                                                    <DatePicker.TableRow>
                                                        <For
                                                            each={
                                                                api().weekDays
                                                            }
                                                        >
                                                            {weekDay => (
                                                                <DatePicker.TableHeader class="size-9 text-center font-mono text-xs font-medium text-muted">
                                                                    {
                                                                        weekDay.narrow
                                                                    }
                                                                </DatePicker.TableHeader>
                                                            )}
                                                        </For>
                                                    </DatePicker.TableRow>
                                                </DatePicker.TableHead>
                                                <DatePicker.TableBody>
                                                    <For each={api().weeks}>
                                                        {week => (
                                                            <DatePicker.TableRow>
                                                                <For
                                                                    each={week}
                                                                >
                                                                    {day => (
                                                                        <DatePicker.TableCell
                                                                            value={
                                                                                day
                                                                            }
                                                                        >
                                                                            <DatePicker.TableCellTrigger
                                                                                class={
                                                                                    dayCellClass
                                                                                }
                                                                            >
                                                                                {
                                                                                    day.day
                                                                                }
                                                                            </DatePicker.TableCellTrigger>
                                                                        </DatePicker.TableCell>
                                                                    )}
                                                                </For>
                                                            </DatePicker.TableRow>
                                                        )}
                                                    </For>
                                                </DatePicker.TableBody>
                                            </DatePicker.Table>
                                        </>
                                    )}
                                </DatePicker.Context>
                            </DatePicker.View>
                        </DatePicker.Content>
                    </DatePicker.Positioner>
                </Portal>
            </DatePicker.Root>
            <button
                type="button"
                class={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
                aria-label={t("app.nextDay")}
                disabled={index() < 0 || index() >= props.days.length - 1}
                onClick={() => step(1)}
            >
                <ChevronRight {...iconProps} />
            </button>
        </div>
    )
}

export const activeDayStart = (
    days: readonly DayGroup[],
    chosen: number | undefined,
    now: number
): number | undefined => {
    if (chosen !== undefined && days.some(day => day.start === chosen)) {
        return chosen
    }
    const todayStart = localDayStart(now)
    if (days.some(day => day.start === todayStart)) return todayStart
    return days[days.length - 1]?.start
}

const dayLabel = (at: number): string =>
    new Intl.DateTimeFormat(locale(), {
        day: "numeric",
        month: "long",
    }).format(new Date(at))

const dateValue = (at: number): DateValue => parseDate(new Date(at))

const midnight = (date: DateValue): number =>
    new Date(date.year, date.month - 1, date.day).getTime()

const dayKey = (at: number): string => {
    const date = new Date(at)
    return dayKeyOf({
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
    })
}

const dayKeyOf = (date: { year: number; month: number; day: number }): string =>
    `${date.year}-${date.month}-${date.day}`
