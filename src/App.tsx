import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Toast } from './components/Layout';
import { useTrips } from './hooks/data';
import TripsPage from './features/TripsPage';
import ItineraryPage from './features/ItineraryPage';
import ItemPage from './features/ItemPage';
import DocsPage from './features/DocsPage';
import TripSettingsPage from './features/TripSettingsPage';
import DocPage from './features/DocPage';
import TemplatePage from './features/TemplatePage';
import PastePage from './features/PastePage';
import PreviewPage from './features/PreviewPage';
import LedgerPage from './features/LedgerPage';
import OutfitsPage from './features/OutfitsPage';
import StoryPage from './features/StoryPage';
import CreditsPage from './features/CreditsPage';
import RestoreConfirm from './components/RestoreConfirm';
import UpdateBanner from './components/UpdateBanner';

function Home() {
  const trips = useTrips();
  if (!trips) return null;
  return <Navigate to={trips.length ? '/itinerary' : '/trips'} replace />;
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollTop />
      <UpdateBanner />
      <RestoreConfirm />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/trips" element={<TripsPage />} />
        <Route path="/itinerary" element={<ItineraryPage />} />
        <Route path="/itinerary/:tripId" element={<ItineraryPage />} />
        <Route path="/item/:itemId" element={<ItemPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/trip/:tripId/settings" element={<TripSettingsPage />} />
        <Route path="/trip/:tripId/ledger" element={<LedgerPage />} />
        <Route path="/trip/:tripId/outfits" element={<OutfitsPage />} />
        <Route path="/trip/:tripId/story" element={<StoryPage />} />
        <Route path="/credits/photos" element={<CreditsPage />} />
        <Route path="/doc/:docId" element={<DocPage />} />
        <Route path="/import/template" element={<TemplatePage />} />
        <Route path="/import/paste" element={<PastePage />} />
        <Route path="/import/preview" element={<PreviewPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toast />
    </>
  );
}
