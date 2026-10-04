import { useParams } from 'react-router'

export default function CarPage() {
  const { id } = useParams()
  return <h1 className="p-8 text-3xl font-bold">Car: {id}</h1>
}
