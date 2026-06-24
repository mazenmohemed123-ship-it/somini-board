"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const router = useRouter();
  const { user, loading, role } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth");
    } else {
      router.replace(role === "superAdmin" ? "/admin" : "/dashboard");
    }
  }, [user, loading, role, router]);

  return null;
}
