import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import MovieDetails from './pages/MovieDetails';
import ShowTimings from './pages/ShowTimings';
import SeatLayout from './pages/SeatLayout';
import Checkout from './pages/Checkout';
import Category from './pages/Category';
import Stream from './pages/Stream';
import AdminDashboard from './pages/AdminDashboard';
import MyBookings from './pages/MyBookings';
import Waitlist from './pages/Waitlist';
import AutonomousBot from './components/AutonomousBot';
import Footer from './components/Footer';
import { AppProvider } from './context/AppContext';
import './index.css';

function App() {
  return (
    <AppProvider>
      <Router>
      <Navbar />
      <div style={{ paddingBottom: '100px' }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/movie/:id" element={<MovieDetails />} />
          <Route path="/buytickets/:id" element={<ShowTimings />} />
          <Route path="/seatlayout/:id" element={<SeatLayout />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/stream" element={<Stream />} />
          <Route path="/category/:name" element={<Category />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/bookings" element={<MyBookings />} />
          <Route path="/waitlist" element={<Waitlist />} />
        </Routes>
      </div>
      <AutonomousBot />
      <Footer />
    </Router>
    </AppProvider>
  );
}

export default App;
