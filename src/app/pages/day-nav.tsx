import { DatePicker, parseDate } from "@ark-ui/solid/date-picker"
import type { DateValue } from "@ark-ui/solid/date-picker"
import { ChevronLeft, ChevronRight } from "lucide-solid"
import { For, createEffect, createMemo, createSignal } from "solid-js"
import { Portal } from "solid-js/web"
import { localDayStart, type DayGroup } from "~/domain"
import { t } from "~/i18n"
import { locale } from "~/i18n/locale"
import {
    screenMenuListClass,
    screenPopupOverModalClass,
    screenPositioning,
} from "~/app/screen-position"
import { buttonVariants, cn } from "~/ui"

const iconProps = { class: "size-4", strokeWidth: 1.75 }

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
    /** Same look as a tab list, for a toolbar row with tabs. */
    bar?: boolean
}) => {
    const available = createMemo(
        () => new Set(props.days.map(day => dayKey(day.start)))
    )
    const index = () => props.days.findIndex(day => day.start === props.value)
    const [focused, setFocused] = createSignal(dateValue(props.value))

    createEffect(() => {
        setFocused(dateValue(props.value))
    })

    const arrowClass = () =>
        buttonVariants({
            variant: "ghost",
            size: props.bar ? "iconSm" : "icon",
        })

    const step = (offset: number) => {
        const next = props.days[index() + offset]
        if (next) props.onChange(next.start)
    }

    return (
        <div
            class={cn(
                "flex items-center",
                props.bar
                    ? "gap-0.5 rounded border border-line bg-inset p-0.5"
                    : "gap-1"
            )}
        >
            <button
                type="button"
                class={arrowClass()}
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
                positioning={screenPositioning({
                    placement: "bottom-start",
                    gutter: 8,
                })}
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
                            "cursor-pointer rounded font-mono text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-accent/20",
                            props.bar
                                ? "h-7 border border-transparent px-2 text-[12px] font-medium tracking-wide uppercase hover:bg-surface hover:text-accent"
                                : cn(
                                      "px-1 font-semibold tracking-tight hover:text-accent",
                                      props.compact ? "text-base" : "text-lg"
                                  )
                        )}
                        aria-label={t("app.openCalendar")}
                    >
                        {dayLabel(props.value)}
                    </DatePicker.Trigger>
                </DatePicker.Control>
                <Portal>
                    <DatePicker.Positioner class={screenPopupOverModalClass}>
                        <DatePicker.Content
                            class={cn(
                                screenMenuListClass,
                                "rounded border border-line bg-surface p-3 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.12),0_1px_3px_-1px_rgba(15,23,42,0.08)]"
                            )}
                        >
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
                class={arrowClass()}
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
