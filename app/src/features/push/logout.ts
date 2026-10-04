let detach: (() => Promise<void>) | null = null;
export const setPushDetach = (next: (() => Promise<void>) | null) => {
  detach = next;
};
export const detachPushBeforeLogout = async () => {
  await detach?.();
};
