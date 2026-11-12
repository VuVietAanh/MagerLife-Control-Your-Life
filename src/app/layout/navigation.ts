import React from "react";
import { Brain, Database, Gauge, MessageCircleHeart, Settings, Shield, Wallet } from "lucide-react";
import { type UserProfile } from "../models/profile";
import { Dashboard } from "../views/dashboard/Dashboard";

export type Tab = "dashboard" | "finance" | "talk" | "account" | "brain" | "food-admin";

export function getNavigationTabs(profile: UserProfile | null): Array<{ id: Tab; label: string; icon: React.ElementType }> {
  return [
    { id: "dashboard", label: "Dashboard", icon: Gauge },
    { id: "finance", label: "Hũ", icon: Wallet },
    { id: "talk", label: "Tâm sự", icon: MessageCircleHeart },
    { id: "account", label: "Tài khoản", icon: Settings },
    { id: "food-admin", label: "Kho món", icon: Database },
    { id: "brain", label: "My Brain", icon: Shield },
  ];
}
