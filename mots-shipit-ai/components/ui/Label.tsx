import { InfoTip } from "@/components/ui/InfoTip";
import { LABEL_DEFINITIONS, type LabelKey } from "@/lib/labelDefinitions";

// A label followed by its ⓘ definition.
export function Label({ text, definition }: { text: string; definition: LabelKey }) {
  return (
    <span className="inline-flex items-center">
      {text}
      <InfoTip label={text} definition={LABEL_DEFINITIONS[definition]} />
    </span>
  );
}
