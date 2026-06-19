import { type InputHTMLAttributes, type ReactNode, forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';
import './Input.css';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  fullWidth?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      prefix,
      suffix,
      fullWidth = false,
      className,
      id: externalId,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = externalId ?? generatedId;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div
        className={cn(
          'input-field',
          fullWidth && 'input-field--full-width',
          className,
        )}
      >
        {label && (
          <label className="input-field__label" htmlFor={inputId}>
            {label}
          </label>
        )}
        <div
          className={cn(
            'input-field__wrapper',
            error && 'input-field__wrapper--error',
          )}
        >
          {prefix && <span className="input-field__prefix">{prefix}</span>}
          <input
            ref={ref}
            id={inputId}
            className="input-field__input"
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            {...props}
          />
          {suffix && <span className="input-field__suffix">{suffix}</span>}
        </div>
        {error && (
          <span id={errorId} className="input-field__error" role="alert">
            {error}
          </span>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

export { Input };
export type { InputProps };
