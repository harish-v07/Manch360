import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Explore from "./pages/Explore";
import CreatorStorefront from "./pages/CreatorStorefront";
import CourseViewer from "./pages/CourseViewer";
import ResetPassword from "./pages/ResetPassword";
import ProductDetail from "./pages/ProductDetail";
import MyOrders from "./pages/MyOrders";
import LessonsManager from "./components/dashboard/LessonsManager";
import CoursePreview from "./pages/CoursePreview";
import DigitalProductViewer from "./pages/DigitalProductViewer";
import Contact from "./pages/Contact";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/creator/:creatorId" element={<CreatorStorefront />} />
          <Route path="/course/:courseId" element={<CourseViewer />} />
          <Route path="/course-preview/:courseId" element={<CoursePreview />} />
          <Route path="/course/:courseId/lessons" element={<LessonsManager />} />
          <Route path="/product/:productId" element={<ProductDetail />} />
          <Route path="/digital-product/:productId" element={<DigitalProductViewer />} />
          <Route path="/my-orders" element={<MyOrders />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
