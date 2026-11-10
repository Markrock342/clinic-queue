pipeline {
    agent any

    environment {
        APP_NAME = 'clinic-queue'
    }

    stages {
        stage('Build') {
            steps {
                sh 'node -v'
                sh 'npm -v'
                sh 'npm ci'
            }
        }

        stage('Test') {
            steps {
                sh 'npm test'
            }
        }

        stage('Deploy') {
            steps {
                sh 'chmod +x scripts/deploy.sh'
                sh './scripts/deploy.sh'
            }
        }
    }

    post {
        success {
            echo 'Build, Test, Deploy สำเร็จ — เปิด http://localhost:3000'
        }
        failure {
            echo 'Pipeline ไม่ผ่าน ดู log ของ stage ที่แดง'
        }
    }
}
