import React from "react";
import { type UserProfile } from "../../models/profile";
import { type FoodLibraryItem } from "../../services/foodLibraryService";
import { FoodAdminView } from "./FoodAdminView";
import { UserFoodLibraryView } from "./UserFoodLibraryView";

export function FoodLibraryView({
  profile,
  onProfileUpdate,
  foodLibrary,
  setFoodLibrary,
}: {
  profile: UserProfile | null;
  onProfileUpdate: (patch: Partial<UserProfile>, sourceText: string) => void;
  foodLibrary: FoodLibraryItem[];
  setFoodLibrary: React.Dispatch<React.SetStateAction<FoodLibraryItem[]>>;
}) {
  if (profile?.role === "admin") {
    return <FoodAdminView profile={profile} foodLibrary={foodLibrary} setFoodLibrary={setFoodLibrary} />;
  }

  return <UserFoodLibraryView profile={profile} onProfileUpdate={onProfileUpdate} />;
}
