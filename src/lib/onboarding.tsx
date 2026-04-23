import { createContext, useContext, useState, type ReactNode } from "react";

interface OnboardingCtx {
  visible: boolean;
  show: () => void;
  hide: () => void;
}

const Ctx = createContext<OnboardingCtx>({
  visible: false,
  show: () => {},
  hide: () => {},
});

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <Ctx.Provider
      value={{
        visible,
        show: () => setVisible(true),
        hide: () => setVisible(false),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useOnboarding = () => useContext(Ctx);
