import { useState, useCallback, memo } from 'react';

const DIGIT_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const UTILITY_KEYS = ['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight'];

/**
 * Input numérico para gumWidth y otros campos mini-input.
 *
 * Mantiene el estado de edición en estado local para evitar re-renders
 * del periodontograma completo en cada keystroke.
 */
const MiniInputCell = memo(function MiniInputCell({
  value,
  inputKey,
  rowKey,
  min,
  max,
  disabled,
  onCommit,
  registerRef,
  programmaticFocusRef,
  variant = 'standard',
}) {
  const [localValue, setLocalValue] = useState(null);

  const isEditing = localValue !== null;
  let displayValue;
  if (isEditing) {
    displayValue = localValue;
  } else if (value !== undefined && value !== null) {
    displayValue = value.toString();
  } else {
    displayValue = variant === 'gumWidth' ? '0' : '0';
  }

  const refCallback = useCallback((node) => {
    registerRef?.(inputKey, node);
  }, [registerRef, inputKey]);

  if (variant === 'gumWidth') {
    const valueToCheck = isEditing ? parseInt(localValue, 10) : Number(value);
    const isRedValue = Number.isFinite(valueToCheck) && valueToCheck >= 0 && valueToCheck <= 2;

    return (
      <input
        ref={refCallback}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onFocus={(e) => {
          const isProgrammatic = programmaticFocusRef?.current === inputKey;
          const shouldAutoSelect =
            isProgrammatic || (!isEditing && (Number(value) === 0 || value === '0'));

          if (shouldAutoSelect) {
            requestAnimationFrame(() => {
              if (e.target && typeof e.target.select === 'function') {
                e.target.select();
              }
              if (isProgrammatic && programmaticFocusRef?.current === inputKey) {
                programmaticFocusRef.current = null;
              }
            });
          } else if (isProgrammatic && programmaticFocusRef?.current === inputKey) {
            programmaticFocusRef.current = null;
          }
        }}
        onChange={(e) => {
          const inputValue = e.target.value;
          setLocalValue(inputValue);

          if (inputValue === '') return;
          const numValue = parseInt(inputValue, 10);
          if (!isNaN(numValue) && numValue >= 0 && numValue <= 10) {
            onCommit?.(numValue);
          }
        }}
        onBlur={(e) => {
          const inputValue = e.target.value.trim();
          if (inputValue === '') {
            onCommit?.(0);
          } else {
            const numValue = parseInt(inputValue, 10);
            if (!isNaN(numValue) && numValue >= 0 && numValue <= 10) {
              onCommit?.(numValue);
            }
          }
          setLocalValue(null);
        }}
        onKeyDown={(e) => {
          const hasSelection = e.target.selectionStart !== e.target.selectionEnd;
          if (DIGIT_KEYS.includes(e.key)) {
            if (e.target.value.length >= 2 && !hasSelection) {
              e.preventDefault();
            }
            return;
          }
          if (!UTILITY_KEYS.includes(e.key)) {
            e.preventDefault();
          }
        }}
        disabled={disabled}
        className={`mini-input ${isRedValue ? 'gum-width-red' : ''}`}
        title="La anchura de la encía debe ser un número del 0-10mm. Si no pone nada, por defecto se pone en 0"
        maxLength="2"
      />
    );
  }

  return (
    <input
      ref={refCallback}
      type="number"
      min={min}
      max={max}
      value={displayValue}
      onMouseDown={(e) => {
        e.preventDefault();
        e.target.focus();
        requestAnimationFrame(() => {
          if (e.target && typeof e.target.select === 'function') {
            e.target.select();
          }
        });
      }}
      onFocus={(e) => {
        const isProgrammatic = programmaticFocusRef?.current === inputKey;
        if (isProgrammatic) {
          programmaticFocusRef.current = null;
          requestAnimationFrame(() => {
            if (e.target && typeof e.target.select === 'function') {
              e.target.select();
            }
          });
        }
      }}
      onChange={(e) => {
        const inputValue = e.target.value;
        setLocalValue(inputValue);

        if (inputValue === '' || inputValue === '-' || inputValue === '+') return;
        const numValue = Number(inputValue);
        if (!Number.isFinite(numValue)) return;
        onCommit?.(numValue);
      }}
      onBlur={(e) => {
        const inputValue = e.target.value.trim();
        if (inputValue === '') {
          onCommit?.(0);
        } else {
          const numValue = Number(inputValue);
          if (Number.isFinite(numValue)) {
            onCommit?.(numValue);
          }
        }
        setLocalValue(null);
      }}
      disabled={disabled}
      className="mini-input"
    />
  );
});

export default MiniInputCell;
