export interface DialogueChoice {
  id: string;
  label: string;
}

export interface DialogueScript {
  speaker?: string;
  lines: string[];
  choices?: DialogueChoice[];
}
