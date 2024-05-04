import "~/styles/globals.css";

import { Inter } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata = {
  title: "SlickCI",
  description: "Generated for EthGlobal Sydney",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`font-sans ${inter.variable} min-h-screen flex flex-col justify-between bg-bg-100`}>
        <TRPCReactProvider>
          <div className="bg-bg-100 p-2 border-b border-dashed border-bg-300">
            <div className="container mx-auto text-text-100">
            SlickCI
            </div>
          </div>
          {children}
          <div>
            FOOTER
          </div>
          </TRPCReactProvider>
      </body>
    </html>
  );
}