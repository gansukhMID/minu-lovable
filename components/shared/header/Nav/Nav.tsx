import type { ReactNode } from "react";

import HeaderNavItem from "./Item/Item";

export type NavItemConfig = {
  label: string;
  href: string;
  dropdown?: ReactNode;
};

export default function HeaderNav() {
  return (
    <div className="flex gap-8 relative lg-max:hidden select-none">
      {NAV_ITEMS.map((item) => (
        <HeaderNavItem key={item.label} {...item} />
      ))}
    </div>
  );
}

export const NAV_ITEMS: NavItemConfig[] = [
  { label: "Home", href: "/" },
  { label: "Builder", href: "/generation" },
  { label: "Projects", href: "/projects" },
];
