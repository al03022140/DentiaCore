import { useState, useCallback, useEffect, useRef, memo } from 'react';

const TEXT_DEBOUNCE_MS = 300;
const TEXT_MAX_LENGTH = 200;

/**
 * Input de texto para notas y campos textuales del periodontograma.
 * Gestiona su propio estado de edición para evitar re-renders globales.
 * Propaga al padre con debounce para no inundar el estado en cada tecla.
 */
const TextInputCell = memo(function TextInputCell({
  value,
  disabled,
  onCommit,
}) {
  const [localValue, setLocalValue] = useState(null);
  const debounceTimerRef = useRef(null);
  const pendingValueRef = useRef(null);

  const isEditing = localValue !== null;
  const displayValue = isEditing ? localValue : (value || '');

  const flushPending = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (pendingValueRef.current !== null) {
      onCommit?.(pendingValueRef.current);
      pendingValueRef.current = null;
    }
  }, [onCommit]);

  useEffect(() => () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  const handleFocus = useCallback((e) => {
    setLocalValue(value || '');
    setTimeout(() => {
      e.target.select();
    }, 0);
  }, [value]);

  const handleChange = useCallback((e) => {
    const inputValue = e.target.value.slice(0, TEXT_MAX_LENGTH);
    setLocalValue(inputValue);
    pendingValueRef.current = inputValue;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      if (pendingValueRef.current !== null) {
        onCommit?.(pendingValueRef.current);
        pendingValueRef.current = null;
      }
    }, TEXT_DEBOUNCE_MS);
  }, [onCommit]);

  const handleBlur = useCallback(() => {
    flushPending();
    setLocalValue(null);
  }, [flushPending]);

  return (
    <input
      type="text"
      value={displayValue}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      disabled={disabled}
      maxLength={TEXT_MAX_LENGTH}
      className="mini-text"
      placeholder="..."
    />
  );
});

export default TextInputCell;
