import type { ChoiceView } from "@/features/setup/catalog";
export interface ChoiceShelfProps {
  label: string;
  options: ChoiceView[];
  selectedId: string;
  columns: number;
  onSelect(option: ChoiceView): void;
  offsets: Record<string, number>;
  category: string;
}
