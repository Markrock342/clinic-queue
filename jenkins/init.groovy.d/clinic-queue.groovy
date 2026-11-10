// รันตอน Jenkins เปิด: ตั้งค่าพื้นฐานและสร้าง Pipeline job "clinic-queue"
// ให้ดึง Jenkinsfile จาก GitHub และเช็กโค้ดใหม่ทุก 2 นาที
import hudson.plugins.git.BranchSpec
import hudson.plugins.git.GitSCM
import hudson.plugins.git.UserRemoteConfig
import hudson.triggers.SCMTrigger
import jenkins.model.Jenkins
import jenkins.model.JenkinsLocationConfiguration
import org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition
import org.jenkinsci.plugins.workflow.job.WorkflowJob

def jenkins = Jenkins.get()
def repo = System.getenv("REPO_URL") ?: "https://github.com/Markrock342/clinic-queue.git"
def port = System.getenv("JENKINS_PORT") ?: "8080"

JenkinsLocationConfiguration.get().setUrl("http://localhost:${port}/")
jenkins.setNumExecutors(2)

def job = jenkins.getItem("clinic-queue")
if (job == null) {
  job = jenkins.createProject(WorkflowJob, "clinic-queue")
}
job.setDescription("ระบบคิวคลินิกบ้านใบเตย — Build, Test, Deploy จาก ${repo}")

def scm = new GitSCM(
  [new UserRemoteConfig(repo, null, null, null)],
  [new BranchSpec("*/main")],
  null, null, []
)
job.setDefinition(new CpsScmFlowDefinition(scm, "Jenkinsfile"))

if (job.getTriggers().isEmpty()) {
  def trigger = new SCMTrigger("H/2 * * * *")
  job.addTrigger(trigger)
  trigger.start(job, true)
}

job.save()
jenkins.save()
println("clinic-queue job พร้อมใช้งาน: ${repo}")
