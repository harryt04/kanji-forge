import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        success: 'bg-success text-success-foreground hover:bg-success/90',
        perfect: 'bg-perfect text-perfect-foreground hover:bg-perfect/90',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        // min-h- (not h-) so a button whose content wraps (no `nowrap`)
        // grows taller instead of clipping its text at a fixed 44px.
        default: 'min-h-11 px-4 py-2',
        sm: 'min-h-11 rounded-md px-3',
        lg: 'min-h-11 rounded-md px-8',
        icon: 'h-11 w-11', // icon content never wraps; keep it square
      },
      // A button holding a sentence (Settings option cards) must wrap; a
      // toolbar or icon button that needs one line opts in explicitly. The
      // base used to force whitespace-nowrap unconditionally, which is what
      // produced 54 overflowing elements on Settings at 375px.
      nowrap: {
        true: 'whitespace-nowrap',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      nowrap: false,
    },
  },
)

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, nowrap, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, nowrap, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
