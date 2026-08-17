import * as React from 'react'
import * as MenubarPrimitive from '@radix-ui/react-menubar'

import { cn } from '@/lib/utils'

const Menubar = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.Root
    ref={ref}
    className={cn(
      'border-border bg-card text-card-foreground flex min-h-11 items-center gap-1 rounded-md border p-1',
      className,
    )}
    {...props}
  />
))
Menubar.displayName = MenubarPrimitive.Root.displayName

const MenubarMenu = MenubarPrimitive.Menu

const MenubarTrigger = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.Trigger
    ref={ref}
    className={cn(
      'focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex min-h-11 items-center rounded-sm px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
      className,
    )}
    {...props}
  />
))
MenubarTrigger.displayName = MenubarPrimitive.Trigger.displayName

const MenubarPortal = MenubarPrimitive.Portal

const MenubarContent = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Content>
>(({ className, align = 'start', alignOffset = -4, ...props }, ref) => (
  <MenubarPrimitive.Portal>
    <MenubarPrimitive.Content
      ref={ref}
      align={align}
      alignOffset={alignOffset}
      className={cn(
        'border-border bg-popover text-popover-foreground z-50 max-h-[min(70vh,32rem)] min-w-48 overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        className,
      )}
      {...props}
    />
  </MenubarPrimitive.Portal>
))
MenubarContent.displayName = MenubarPrimitive.Content.displayName

type MenubarItemProps = React.ComponentPropsWithoutRef<
  typeof MenubarPrimitive.Item
> & {
  inset?: boolean
}

const MenubarItem = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Item>,
  MenubarItemProps
>(({ className, inset, ...props }, ref) => (
  <MenubarPrimitive.Item
    ref={ref}
    className={cn(
      'focus:bg-accent focus:text-accent-foreground relative flex min-h-11 cursor-default items-center rounded-sm px-3 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      inset && 'pl-8',
      className,
    )}
    {...props}
  />
))
MenubarItem.displayName = MenubarPrimitive.Item.displayName

const MenubarCheckboxItem = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <MenubarPrimitive.CheckboxItem
    ref={ref}
    checked={checked}
    className={cn(
      'focus:bg-accent focus:text-accent-foreground relative flex min-h-11 cursor-default items-center rounded-sm py-1 pr-3 pl-8 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-4 items-center justify-center">
      <MenubarPrimitive.ItemIndicator>
        <span aria-hidden="true">✓</span>
      </MenubarPrimitive.ItemIndicator>
    </span>
    {children}
  </MenubarPrimitive.CheckboxItem>
))
MenubarCheckboxItem.displayName = MenubarPrimitive.CheckboxItem.displayName

const MenubarRadioGroup = MenubarPrimitive.RadioGroup

const MenubarRadioItem = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <MenubarPrimitive.RadioItem
    ref={ref}
    className={cn(
      'focus:bg-accent focus:text-accent-foreground relative flex min-h-11 cursor-default items-center rounded-sm py-1 pr-3 pl-8 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-4 items-center justify-center">
      <MenubarPrimitive.ItemIndicator>
        <span aria-hidden="true">●</span>
      </MenubarPrimitive.ItemIndicator>
    </span>
    {children}
  </MenubarPrimitive.RadioItem>
))
MenubarRadioItem.displayName = MenubarPrimitive.RadioItem.displayName

const MenubarLabel = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Label>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.Label
    ref={ref}
    className={cn('px-3 py-1.5 text-sm font-semibold', className)}
    {...props}
  />
))
MenubarLabel.displayName = MenubarPrimitive.Label.displayName

const MenubarSeparator = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <MenubarPrimitive.Separator
    ref={ref}
    className={cn('bg-border my-1 h-px', className)}
    {...props}
  />
))
MenubarSeparator.displayName = MenubarPrimitive.Separator.displayName

const MenubarItemIndicator = MenubarPrimitive.ItemIndicator

/**
 * Form controls inside a menu must not participate in Radix's typeahead.
 * Stopping keydown propagation keeps printable input from moving focus back to
 * the menubar trigger while preserving normal input behavior.
 */
const MenubarFormField = ({
  className,
  onKeyDown,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement => (
  <div
    className={cn(
      'min-h-11 px-3 py-1.5 text-base [&_input]:text-base [&_select]:text-base [&_textarea]:text-base',
      className,
    )}
    onKeyDown={(event) => {
      event.stopPropagation()
      onKeyDown?.(event)
    }}
    {...props}
  />
)
MenubarFormField.displayName = 'MenubarFormField'

export {
  Menubar,
  MenubarContent,
  MenubarFormField,
  MenubarItem,
  MenubarItemIndicator,
  MenubarCheckboxItem,
  MenubarLabel,
  MenubarMenu,
  MenubarPortal,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarTrigger,
}
