import { Link } from "react-router-dom";

export const Footer = () => {
  return (
    <footer className="bg-muted mt-20">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-xl font-black mb-4 tracking-tighter">
              Manch360
            </h3>
            <p className="text-muted-foreground text-sm font-medium">
              Empowering creators to teach, share, and earn.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Platform</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/explore" className="text-muted-foreground hover:text-primary transition-colors">
                  Explore Creators
                </Link>
              </li>
              <li>
                <Link to="/auth?mode=signup" className="text-muted-foreground hover:text-primary transition-colors">
                  Become a Creator
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Resources</h4>
            <ul className="space-y-2 text-sm">
              <li className="text-muted-foreground">About</li>
              <li className="text-muted-foreground">FAQ</li>
              <li className="text-muted-foreground">Contact</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li className="text-muted-foreground">Privacy Policy</li>
              <li className="text-muted-foreground">Terms of Service</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-8 text-center text-sm text-muted-foreground">
          <p>© 2026 Manch360. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};