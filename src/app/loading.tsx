import { LoadingState } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <LoadingState />
    </div>
  );
}
