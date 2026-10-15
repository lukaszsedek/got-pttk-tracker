import MapLoader from "@/components/MapLoader";

export default function Home() {
  return (
    <main className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h1 className="font-semibold">GOT PTTK Tracker — T.01 Tatry</h1>
        <div className="flex gap-4 text-sm">
          <span className="text-green-600">● zaliczone</span>
          <span className="text-gray-500">● nieprzebyte</span>
        </div>
      </header>
      <div className="flex-1">
        <MapLoader />
      </div>
    </main>
  );
}
