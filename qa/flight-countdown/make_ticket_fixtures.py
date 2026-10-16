"""Synthetic QA documents only; no passenger or real booking data."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pdfencrypt import StandardEncryption
out=Path(__file__).parent/'tickets';out.mkdir(exist_ok=True)
def make(name,pages,encrypt=None):
 c=canvas.Canvas(str(out/name),pagesize=(612,792),encrypt=encrypt)
 for lines in pages:
  for x,y,text in lines:c.drawString(x,y,text)
  c.showPage()
 c.save()
make('round-trip.pdf',[
 [(50,740,'SYNTHETIC QA - OUTBOUND FLIGHT'),(50,710,'Booking created 16 OCT 2026 10:00'),(50,670,'Departure: Singapore SIN'),(50,645,'10 JAN 2027 06:10'),(50,605,'Arrival: Tokyo HND'),(50,580,'10 JAN 2027 14:20'),(50,540,'Boarding: 10 JAN 2027 05:30')],
 [(50,740,'SYNTHETIC QA - RETURN FLIGHT'),(50,690,'Departure: Tokyo HND'),(50,665,'19 JAN 2027 20:30'),(50,625,'Arrival: Singapore SIN'),(50,600,'20 JAN 2027 02:40')]
])
make('columns.pdf',[[
 (50,740,'SYNTHETIC QA - TWO COLUMN ITINERARY'),(50,700,'Departure'),(340,700,'Arrival'),(50,670,'Singapore SIN'),(340,670,'Tokyo HND'),(50,645,'10 JAN 2027'),(340,645,'10 JAN 2027'),(50,620,'06:10'),(340,620,'14:20'),
 (50,540,'Departure'),(340,540,'Arrival'),(50,510,'Tokyo HND'),(340,510,'Singapore SIN'),(50,485,'19 JAN 2027'),(340,485,'20 JAN 2027'),(50,460,'20:30'),(340,460,'02:40')
]])
make('ambiguous.pdf',[[(50,700,'Departure 10/01/2027 06:10'),(50,600,'Departure 19/01/2027 20:30')]])
make('no-text.pdf',[[]])
make('protected.pdf',[[(50,700,'Departure 10 JAN 2027 06:10')]],StandardEncryption('synthetic-qa-password'))
