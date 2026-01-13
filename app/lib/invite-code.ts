const EARLY_ACCESS_CODE = "EARLYACCESS";

export const isInviteCodeValid = (code: string): boolean => {
  return code === EARLY_ACCESS_CODE;
};

export const inviteCodeErrorMessage = (): string => {
  return "Unable to unlock Early Access. Please try again.";
};
