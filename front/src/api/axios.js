import axios from 'axios'

const api = axios.create({
  baseURL: 'http://127.0.0.1:5000/api', // Adjust as needed
  withCredentials: true,               // Allow cookies (Flask sessions)
})

export default api
