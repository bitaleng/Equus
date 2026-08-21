import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[15px] text-sm font-semibold tracking-[-0.01em] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0" +
  " btn-ios-shell",
  {
    variants: {
      variant: {
        default:
          // 채워진 색 버튼은 테두리 없이 그림자만으로 입체감을 준다 (아래쪽에 링처럼 보이는 걸 방지)
          "btn-ios-primary btn-ios-oncolor bg-primary text-primary-foreground border border-transparent",
        destructive:
          "btn-ios-destructive btn-ios-oncolor bg-destructive text-destructive-foreground border border-transparent",
        outline:
          // Shows the background color of whatever card / sidebar / accent background it is inside of.
          // Inherits the current text color.
          "btn-ios-onlight border [border-color:var(--button-outline)]",
        secondary: "btn-ios-onlight bg-secondary text-secondary-foreground border border-secondary-border",
        // Add a transparent border so that when someone toggles a border on later, it doesn't shift layout/size.
        ghost: "btn-ios-ghost border border-transparent",
        // No opinionated color/gradient at all — for consumers (e.g. LockerButton) that fully
        // own their own background/border/shadow per state and only want the shell's shape + press animation.
        tile: "border-transparent",
      },
      // Heights are set as "min" heights, because sometimes Ai will place large amount of content
      // inside buttons. With a min-height they will look appropriate with small amounts of content,
      // but will expand to fit large amounts of content.
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-[12px] px-3 text-xs",
        lg: "min-h-10 rounded-[17px] px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
