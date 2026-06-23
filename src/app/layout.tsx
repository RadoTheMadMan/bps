

import './globals.css';
// FORCE LEAFLET STYLES INTO THE CORE LAYOUT
import 'leaflet/dist/leaflet.css';

export const metadata = {
  title: 'Balkan Pocket Saver',
  description: 'Hyper-Budgeting Survival Engine',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-zinc-950">
      <body className="antialiased min-h-screen bg-zinc-950 m-0 p-0">{children}</body>
    </html>
  );
}