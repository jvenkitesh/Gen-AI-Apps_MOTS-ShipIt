import { Input } from "@/components/ui/Input";

type FormFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  hint?: string;
};

export function FormField({ id, label, hint, ...inputProps }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body-sm font-medium text-grey-900">
        {label}
      </label>
      <Input id={id} name={id} aria-describedby={hint ? `${id}-hint` : undefined} {...inputProps} />
      {hint && (
        <p id={`${id}-hint`} className="text-body-sm text-grey-500">
          {hint}
        </p>
      )}
    </div>
  );
}
