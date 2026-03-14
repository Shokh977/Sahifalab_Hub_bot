from sqlalchemy.orm import Session
from app.models.models import Quote, Quiz, QuizQuestion, Book, Resource
from app.db.session import SessionLocal
import json

def seed_database():
    """Seed database with initial data"""
    db = SessionLocal()
    
    try:
        # Clear existing data
        db.query(Quote).delete()
        db.query(QuizQuestion).delete()
        db.query(Quiz).delete()
        db.query(Book).delete()
        db.query(Resource).delete()
        
        # Add Quotes
        quotes = [
            Quote(
                text="The only way to do great work is to love what you do.",
                author="Steve Jobs",
                quote_type="quote",
                is_active=True
            ),
            Quote(
                text="Innovation distinguishes between a leader and a follower.",
                author="Steve Jobs",
                quote_type="quote",
                is_active=True
            ),
            Quote(
                text="Life is what happens when you're busy making other plans.",
                author="John Lennon",
                quote_type="quote",
                is_active=True
            ),
            Quote(
                text="📢 Welcome to SAHIFALAB! Start your learning journey today.",
                author="SAHIFALAB Team",
                quote_type="announcement",
                is_active=True
            ),
        ]
        db.add_all(quotes)
        db.flush()
        
        # Add Quizzes
        quiz1 = Quiz(
            title="Introduction to Python",
            book_title="Python 101",
            description="Test your Python basics knowledge",
            difficulty="easy",
            category="programming",
            total_questions=3
        )
        db.add(quiz1)
        db.flush()
        
        # Add Quiz Questions for Python Quiz
        questions1 = [
            QuizQuestion(
                quiz_id=quiz1.id,
                question="What is the output of print(type(5))?",
                options=json.dumps(["<class 'int'>", "<class 'float'>", "<class 'str'>", "<class 'number'>"]),
                correct_answer=0,
                explanation="The type() function returns the class of an object. 5 is an integer.",
                order=0
            ),
            QuizQuestion(
                quiz_id=quiz1.id,
                question="Which keyword is used to define a function in Python?",
                options=json.dumps(["function", "def", "define", "func"]),
                correct_answer=1,
                explanation="The 'def' keyword is used to define a function in Python.",
                order=1
            ),
            QuizQuestion(
                quiz_id=quiz1.id,
                question="What does the len() function do?",
                options=json.dumps(["Returns the length of an object", "Returns the type of object", "Deletes an object", "None of the above"]),
                correct_answer=0,
                explanation="The len() function returns the length of an object like a string, list, or tuple.",
                order=2
            ),
        ]
        db.add_all(questions1)
        
        quiz2 = Quiz(
            title="الكتاب المقدس - أساسيات الإيمان",
            book_title="الكتاب المقدس",
            description="اختبار معرفتك بأساسيات الإيمان",
            difficulty="medium",
            category="religion",
            total_questions=2
        )
        db.add(quiz2)
        db.flush()
        
        questions2 = [
            QuizQuestion(
                quiz_id=quiz2.id,
                question="كم عدد أسفار الكتاب المقدس؟",
                options=json.dumps(["60", "66", "70", "75"]),
                correct_answer=1,
                explanation="الكتاب المقدس يحتوي على 66 سفراً - 39 في العهد القديم و27 في العهد الجديد",
                order=0
            ),
            QuizQuestion(
                quiz_id=quiz2.id,
                question="كم عدد الأنبياء المذكورين في القرآن الكريم؟",
                options=json.dumps(["25", "30", "35", "40"]),
                correct_answer=0,
                explanation="يبلغ عدد الأنبياء المذكورين في القرآن الكريم 25 نبياً",
                order=1
            ),
        ]
        db.add_all(questions2)
        
        db.flush()
        
        # Add Books
        books = [
            Book(
                title="Python for Beginners",
                author="John Smith",
                description="A comprehensive guide to Python programming for beginners",
                price=0,
                is_paid=False,
                file_url="https://example.com/python-beginners.pdf",
                thumbnail_url="https://via.placeholder.com/200x300?text=Python+Beginners",
                category="programming",
                downloads=150,
                rating=4.5,
                is_available=True
            ),
            Book(
                title="Advanced JavaScript",
                author="Jane Doe",
                description="Master advanced JavaScript concepts and patterns",
                price=29.99,
                is_paid=True,
                file_url="https://example.com/advanced-js.pdf",
                thumbnail_url="https://via.placeholder.com/200x300?text=Advanced+JS",
                category="programming",
                downloads=75,
                rating=4.8,
                is_available=True
            ),
            Book(
                title="تعلم اللغة العربية",
                author="أحمد محمد",
                description="كتاب شامل لتعلم قواعد اللغة العربية",
                price=0,
                is_paid=False,
                file_url="https://example.com/learn-arabic.pdf",
                thumbnail_url="https://via.placeholder.com/200x300?text=Arabic",
                category="languages",
                downloads=200,
                rating=4.7,
                is_available=True
            ),
            Book(
                title="Data Science Mastery",
                author="Robert Johnson",
                description="Complete guide to data science with Python and Machine Learning",
                price=49.99,
                is_paid=True,
                file_url="https://example.com/data-science.pdf",
                thumbnail_url="https://via.placeholder.com/200x300?text=Data+Science",
                category="programming",
                downloads=120,
                rating=4.6,
                is_available=True
            ),
        ]
        db.add_all(books)
        db.flush()
        
        # Add Resources
        resources = [
            Resource(
                title="Python Official Documentation",
                description="Official Python documentation and tutorials",
                url="https://docs.python.org/3/",
                resource_type="link",
                category="programming",
                thumbnail_url="https://via.placeholder.com/200x150?text=Python+Docs"
            ),
            Resource(
                title="Web Development with React - Tutorial",
                description="Complete YouTube tutorial series for React development",
                url="https://www.youtube.com/results?search_query=react+tutorial",
                resource_type="youtube",
                category="programming",
                thumbnail_url="https://via.placeholder.com/200x150?text=React+Tutorial"
            ),
            Resource(
                title="Khan Academy - Mathematics",
                description="Comprehensive mathematics courses from Khan Academy",
                url="https://www.khanacademy.org/math",
                resource_type="course",
                category="education",
                thumbnail_url="https://via.placeholder.com/200x150?text=Khan+Academy"
            ),
            Resource(
                title="Quran Recitation by Famous Qaris",
                description="Collection of beautiful Quran recitations",
                url="https://www.youtube.com/results?search_query=quran+recitation",
                resource_type="youtube",
                category="religion",
                thumbnail_url="https://via.placeholder.com/200x150?text=Quran"
            ),
            Resource(
                title="Coursera - Free Online Courses",
                description="Access thousands of free and paid online courses",
                url="https://www.coursera.org",
                resource_type="course",
                category="education",
                thumbnail_url="https://via.placeholder.com/200x150?text=Coursera"
            ),
            Resource(
                title="Business Growth Strategies - Video Series",
                description="Learn proven business growth strategies from experts",
                url="https://www.youtube.com/results?search_query=business+growth+strategies",
                resource_type="youtube",
                category="business",
                thumbnail_url="https://via.placeholder.com/200x150?text=Business"
            ),
        ]
        db.add_all(resources)
        
        db.commit()
        print("✅ Database seeded successfully!")
        print(f"  - {len(quotes)} quotes added")
        print(f"  - {len([q for q in [quiz1, quiz2]])} quizzes added")
        print(f"  - {len(books)} books added")
        print(f"  - {len(resources)} resources added")
        
    except Exception as e:
        print(f"❌ Error seeding database: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
