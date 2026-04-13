import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

export function ModeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="w-full relative flex items-center justify-start h-11 px-[14px] rounded-xl text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors group"
      aria-label="Toggle theme"
    >
      <div className="w-[22px] flex items-center justify-center flex-shrink-0 lg:mr-0 group-hover:lg:mr-4 mr-4 transition-all duration-300 relative">
        <Sun className="h-[20px] w-[20px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 dark:opacity-0" strokeWidth={2} />
        <Moon className="absolute h-[20px] w-[20px] rotate-90 scale-0 opacity-0 transition-all dark:rotate-0 dark:scale-100 dark:opacity-100" strokeWidth={2} />
      </div>
      <span className="opacity-100 font-semibold lg:opacity-0 group-hover:lg:opacity-100 transition-opacity duration-300 delay-75 absolute left-12 lg:left-12 whitespace-nowrap">
        {theme === "dark" ? "Light Mode" : "Dark Mode"}
      </span>
    </button>
  )
}
