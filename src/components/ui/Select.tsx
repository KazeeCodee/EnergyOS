import { useState, useRef, useEffect, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string | number;
  label: ReactNode;
}

export interface SelectProps {
  value: string | number;
  onChange: (value: string | number) => void;
  options: SelectOption[];
  className?: string;
  placeholder?: string;
}

export function Select({ value, onChange, options, className = "", placeholder }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`group flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-sm font-medium shadow-sm transition-all focus:border-[#15caca] focus:outline-none focus:ring-2 focus:ring-[#15caca]/20 ${
          isOpen ? "border-[#15caca] ring-2 ring-[#15caca]/20 text-[#15caca]" : "border-slate-200 hover:border-slate-300 text-slate-700"
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={`truncate ${!selectedOption ? "text-slate-400" : ""}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 transition-transform duration-300 ${
            isOpen ? "rotate-180 text-[#15caca]" : "text-slate-400 group-hover:text-[#15caca]"
          }`}
        />
      </button>

      <div
        className={`absolute z-50 mt-2 left-0 right-0 min-w-max origin-top overflow-hidden rounded-xl border border-slate-200 bg-white/95 py-2 shadow-xl backdrop-blur-xl transition-all duration-200 ${
          isOpen ? "scale-100 opacity-100 pointer-events-auto" : "scale-95 opacity-0 pointer-events-none"
        }`}
      >
        <ul className="max-h-60 overflow-y-auto" role="listbox" style={{ scrollbarWidth: "thin" }}>
          {options.map((option) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`block cursor-pointer border-l-[3px] border-transparent px-3 py-2.5 text-sm font-medium transition-all hover:bg-slate-50 hover:border-[#15caca] hover:pl-4 hover:text-[#15caca] active:bg-[#15caca]/10 ${
                option.value === value ? "border-[#15caca] text-[#15caca] bg-slate-50 pl-4" : "text-slate-600"
              }`}
            >
              {option.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
