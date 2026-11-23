import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from '@radix-ui/react-slot'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { ComponentProps } from 'react'
export const buttonStyle = cva('button', {
  variants: {
    variant: {
      primary: 'button-primary',
      outline: 'button-outline',
      ghost: 'button-ghost',
    },
    size: { normal: '', small: 'button-small' },
  },
  defaultVariants: { variant: 'primary', size: 'normal' },
})
export function Button({
  variant,
  size,
  className,
  asChild = false,
  ...props
}: ComponentProps<'button'> &
  VariantProps<typeof buttonStyle> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button'
  return (
    <Component
      data-slot="button"
      className={twMerge(clsx(buttonStyle({ variant, size }), className))}
      {...props}
    />
  )
}
