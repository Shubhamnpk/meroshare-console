"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { forwardRef, useEffect, useState } from "react"
import type { ComponentPropsWithoutRef } from "react"

type NumberFormat = "us" | "eu" | "np"

const STORAGE_KEY = "ms-number-format"
const LEGACY_KEY = "wallet_number_format"

function readStoredFormat(): NumberFormat {
  if (typeof window === "undefined") return "np"
  const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_KEY)
  if (raw === "us" || raw === "eu" || raw === "np") return raw
  if (raw === "in") return "np"
  return "np"
}

function localeFor(format: NumberFormat): string {
  return format === "us" ? "en-US" : format === "eu" ? "de-DE" : "en-NP"
}

export function setNumberFormat(format: NumberFormat) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, format)
  window.dispatchEvent(new Event("numberFormatChange"))
  window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: format } as unknown as StorageEventInit))
}

export function getNumberFormat(): NumberFormat {
  return readStoredFormat()
}

interface AmountInputProps extends Omit<ComponentPropsWithoutRef<typeof Input>, "value" | "onChange" | "type"> {
  value: string | number
  onChange: (value: string) => void
  label?: string
  required?: boolean
}

const CURRENCY_SYMBOL = "रु"

export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(
  ({ value, onChange, label, required = false, className, ...props }, ref) => {
    const [displayAmount, setDisplayAmount] = useState("")
    const [locale, setLocale] = useState<NumberFormat>(() => readStoredFormat())

    const getLocaleString = () => localeFor(locale)

    useEffect(() => {
      const updateFormat = () => {
        const next = readStoredFormat()
        setLocale(next)
        const stringValue = typeof value === "number" ? value.toString() : value
        setDisplayAmount(formatDisplayAmount(stringValue, localeFor(next)))
      }
      window.addEventListener("storage", updateFormat)
      window.addEventListener("numberFormatChange", updateFormat)
      updateFormat()
      return () => {
        window.removeEventListener("storage", updateFormat)
        window.removeEventListener("numberFormatChange", updateFormat)
      }
    }, [value])

    const formatDisplayAmount = (rawValue: string, loc = getLocaleString()) => {
      if (!rawValue) return ""
      const hasTrailingDot = rawValue.endsWith(".")
      const parts = rawValue.split(".")
      const intPart = parts[0] || "0"
      const decPart = parts.length > 1 ? parts[1] : ""
      const n = Number.parseInt(intPart, 10)
      const formattedInt = Number.isNaN(n) ? "0" : n.toLocaleString(loc)
      if (hasTrailingDot) return `${formattedInt}.`
      if (decPart) return `${formattedInt}.${decPart}`
      return formattedInt
    }

    useEffect(() => {
      const stringValue = typeof value === "number" ? value.toString() : value
      setDisplayAmount(formatDisplayAmount(stringValue))
    }, [value, locale])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      const rawValue = val.replace(/,/g, "").replace(/\s/g, "")
      const isValid = /^\d*\.?\d{0,2}$/.test(rawValue) || rawValue === ""
      if (isValid) {
        setDisplayAmount(formatDisplayAmount(rawValue))
        onChange(rawValue)
      }
    }

    const handleBlur = () => {
      if (displayAmount.endsWith(".")) {
        const cleanValue = displayAmount.slice(0, -1)
        setDisplayAmount(cleanValue)
        onChange(cleanValue.replace(/,/g, ""))
      }
    }

    return (
      <div className="space-y-1">
        {label && (
          <Label htmlFor={props.id} className="text-sm font-medium flex items-center gap-1">
            {label}
            {required && <span className="text-orange-500">*</span>}
          </Label>
        )}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">
            {CURRENCY_SYMBOL}
          </span>
          <Input
            ref={ref}
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={displayAmount}
            onChange={handleChange}
            onBlur={handleBlur}
            className="pl-8"
            {...props}
          />
        </div>
      </div>
    )
  },
)

AmountInput.displayName = "AmountInput"
