import { getSharePage } from "@/api/share";
import { useQuery } from "@tanstack/react-query";

// GET /share/{shareSlug}
// 共有URLから完成動画の閲覧情報を取得する。認証不要・完成済みの固定データなので
// polling はしない。projects.status が completed でなければサーバーが404を返す。
export function useSharePage(shareSlug: string | undefined) {
  return useQuery({
    queryKey: ["share", shareSlug],
    enabled: !!shareSlug,
    queryFn: () => {
      if (!shareSlug) throw new Error("shareSlug is required");
      return getSharePage(shareSlug);
    },
  });
}
