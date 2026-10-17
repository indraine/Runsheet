import { ark } from "@ark-ui/solid/factory"
import type { HTMLArkProps } from "@ark-ui/solid/factory"
import { type VariantProps, cva } from "class-variance-authority"
import { splitProps } from "solid-js"
import { cn } from "~/ui/cn"

const buttonVariants = cva(
    [
        "inline-flex items-center justify-center gap-1.5 rounded border border-transparent",
        "font-mono text-xs font-medium tracking-wide uppercase select-none",
        "transition-colors",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-accent/20",
        "disabled:pointer-events-none disabled:opacity-40",
    ],
    {
        variants: {
            variant: {
                primary: "bg-accent text-on-accent hover:bg-[#1e56a0]",
                secondary: "border-line bg-surface text-ink hover:bg-inset",
                ghost: "bg-transparent text-secondary hover:bg-inset hover:text-ink",
            },
            size: {
                md: "h-8 px-2.5",
                sm: "h-7 px-2",
                icon: "size-8 p-0",
            },
        },
        defaultVariants: {
            variant: "primary",
            size: "md",
        },
    }
)

export type ButtonProps = HTMLArkProps<"button"> &
    VariantProps<typeof buttonVariants>

export function Button(props: ButtonProps) {
    const [local, rest] = splitProps(props, [
        "class",
        "variant",
        "size",
        "type",
    ])

    return (
        <ark.button
            type={local.type ?? "button"}
            class={cn(
                buttonVariants({ variant: local.variant, size: local.size }),
                local.class
            )}
            {...rest}
        />
    )
}

export { buttonVariants }
