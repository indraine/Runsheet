import {
  TooltipArrow,
  TooltipArrowTip,
  TooltipContent,
  TooltipPositioner,
  TooltipRoot,
  TooltipTrigger,
  type TooltipArrowProps,
  type TooltipArrowTipProps,
  type TooltipContentProps,
  type TooltipPositionerProps,
  type TooltipTriggerProps,
} from "@ark-ui/solid/tooltip";
import { cva } from "class-variance-authority";
import { splitProps } from "solid-js";
import { cn } from "~/ui/cn";

const triggerVariants = cva(
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-accent/20",
);
const positionerVariants = cva("z-50");
const contentVariants = cva(
  [
    "rounded border border-line bg-surface px-2 py-1",
    "font-mono text-[11px] text-ink",
    "shadow-[0_4px_12px_-2px_rgba(15,23,42,0.06),0_1px_3px_-1px_rgba(15,23,42,0.04)]",
  ],
);
const arrowVariants = cva("[--arrow-background:var(--surface)] [--arrow-size:6px]");
const arrowTipVariants = cva("border-s border-t border-line");

export function TooltipTriggerView(props: TooltipTriggerProps) {
  const [local, rest] = splitProps(props, ["class"]);
  return <TooltipTrigger class={cn(triggerVariants(), local.class)} {...rest} />;
}

export function TooltipPositionerView(props: TooltipPositionerProps) {
  const [local, rest] = splitProps(props, ["class"]);
  return <TooltipPositioner class={cn(positionerVariants(), local.class)} {...rest} />;
}

export function TooltipContentView(props: TooltipContentProps) {
  const [local, rest] = splitProps(props, ["class"]);
  return <TooltipContent class={cn(contentVariants(), local.class)} {...rest} />;
}

export function TooltipArrowView(props: TooltipArrowProps) {
  const [local, rest] = splitProps(props, ["class"]);
  return <TooltipArrow class={cn(arrowVariants(), local.class)} {...rest} />;
}

export function TooltipArrowTipView(props: TooltipArrowTipProps) {
  const [local, rest] = splitProps(props, ["class"]);
  return <TooltipArrowTip class={cn(arrowTipVariants(), local.class)} {...rest} />;
}

export const Tooltip = {
  Root: TooltipRoot,
  Trigger: TooltipTriggerView,
  Positioner: TooltipPositionerView,
  Content: TooltipContentView,
  Arrow: TooltipArrowView,
  ArrowTip: TooltipArrowTipView,
};
