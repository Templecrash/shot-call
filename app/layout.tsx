import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Shot Call — Put your conviction to work',description:'Turn a crypto thesis into a token basket. Explore ideas, understand allocations, and back your conviction with simulated wallet trades.',metadataBase:new URL('https://supertake-crypto-sascha.saschadarius.chatgpt.site'),openGraph:{title:'Shot Call',description:'A little conviction. A whole portfolio.',images:['/og-shot-call.png']},twitter:{card:'summary_large_image',title:'Shot Call',description:'A little conviction. A whole portfolio.',images:['/og-shot-call.png']},icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
