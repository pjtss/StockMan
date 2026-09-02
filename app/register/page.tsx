import { UserAuthForm } from "@/components/user-auth-form";
import { PageNavigation } from "@/components/page-navigation";
export default function RegisterPage(){return <><PageNavigation current="register" /><main className="page-shell"><UserAuthForm mode="register" /></main></>}
