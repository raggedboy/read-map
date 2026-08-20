import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={
 metadataBase:new URL("https://read-map.panhj2014.chatgpt.site"),
 title:"Read Map · 阅读地图",
 description:"筛选、组织并沉淀真正值得阅读的书籍、文章、论文与源码。",
 openGraph:{title:"阅读地图",description:"筛选、组织并沉淀真正值得阅读的内容。",images:[{url:"/og.png",width:1200,height:630,alt:"阅读地图"}]},
 twitter:{card:"summary_large_image",title:"阅读地图",description:"筛选、组织并沉淀真正值得阅读的内容。",images:["/og.png"]}
};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="zh-CN"><body>{children}</body></html>}
