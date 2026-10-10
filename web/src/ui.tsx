import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function IconButton({
  label,
  onClick,
  disabled,
  children,
  className = '',
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className={`dialog-shell ${wide ? 'wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      aria-label={title}
    >
      <div className="dialog-title">
        <h2>{title}</h2>
        <IconButton label="关闭对话框" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </div>
      {children}
    </dialog>
  )
}
export const formatTime = (time: number) =>
  `${Math.floor(time / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(time % 60)
    .toString()
    .padStart(2, '0')}`
export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
