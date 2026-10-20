let csrf: string | null = null;
export const sessionCsrf = () => csrf;
export const setSessionCsrf = (value: string | null) => {
  csrf = value;
};
