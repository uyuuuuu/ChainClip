# ChainClip Mobile
技術:Expo Router(src/app)/TanStack Query/Zustand/expo-video/NativeWind。

データ:時間は整数ミリ秒、座標/crop/zoom/offsetは正規化(0〜1)で基準は変換後mp4。ID=project/clip/sceneはサーバー発行uuid、cutはクライアント生成。API型はopenapi-typescript生成(手書き禁止)、enum(aspectRatio/transition種別)はconstants/enums.tsでサーバーと一致。

設計:projects.statusでUI切替、pollingはpreparing/rendering中のみ。時間変換・zoom/offset→切抜矩形・editConfig組立はdomain/に集約しUIと分離。出力サイズは全体固定、カット表示調整はcropでなくzoom+offset。範囲再生はclip全体mp4の[startMs,endMs]を0始まりで共通部品化。token/device_idはexpo-secure-store保管し全APIへ付与。