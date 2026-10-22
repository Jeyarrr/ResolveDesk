export function uploadForm(body: Record<string, unknown>, files: File[], submissionId: string) {
  const form = new FormData();
  Object.entries({ ...body, submissionId }).forEach(([key, value]) => {
    if (value !== undefined && value !== null) form.append(key, String(value));
  });
  files.forEach((file) => form.append('files', file));
  return form;
}
