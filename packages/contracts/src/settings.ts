import { z } from 'zod';

export const displaySettingsSchema = z
  .object({
    calendar: z.enum(['AD', 'BS']),
    timeZone: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
          return true;
        } catch {
          return false;
        }
      }, 'Choose a valid timezone.'),
    hourCycle: z.enum(['h12', 'h23']),
  })
  .strict();
export type DisplaySettings = z.infer<typeof displaySettingsSchema>;
export const defaultDisplaySettings: DisplaySettings = {
  calendar: 'AD',
  timeZone: 'Asia/Kathmandu',
  hourCycle: 'h23',
};
