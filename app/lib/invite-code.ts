const EARLY_ACCESS_CODE = "EARLYACCESS";

export const isInviteCodeValid = (code: string): boolean => {
  return code === EARLY_ACCESS_CODE;
};

export const inviteCodeErrorMessage = (): string => {
  return "Invalid invite code. Please check your code and try again, or contact support if you believe this is an error.";
};
