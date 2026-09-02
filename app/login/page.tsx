import { UserAuthForm } from "@/components/user-auth-form";
import { PageNavigation } from "@/components/page-navigation";
export default function LoginPage(){return <><PageNavigation current="login" /><main className="page-shell"><UserAuthForm mode="login" /></main></>}
