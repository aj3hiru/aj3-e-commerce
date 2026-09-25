"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputCls } from "./Meesho";

export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#a7a9b6]" strokeWidth={1.8} />
      <input {...props} type={show ? "text" : "password"} className={cn(inputCls, "h-12 pl-10 pr-11", props.className)} />
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center text-[#8b8ba3]">
        {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
      </button>
    </div>
  );
}
